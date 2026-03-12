export default async function handler(req, res) {
  // Configuração de CORS para permitir chamadas do seu domínio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Responde rapidamente a requisições de preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Apenas método POST é permitido' });
  }

  try {
    const { amount, customer, items, utm_data } = req.body;

    // --- 1. TRATAMENTO DO DOCUMENTO (Evita erro 'replace is not a function') ---
    let cleanDocument = "";
    if (customer && customer.document) {
      if (typeof customer.document === 'object' && customer.document.number) {
        cleanDocument = String(customer.document.number).replace(/\D/g, '');
      } else if (typeof customer.document === 'string') {
        cleanDocument = customer.document.replace(/\D/g, '');
      }
    }

    // --- 2. LIMPEZA DE DEMAIS DADOS ---
    const cleanPhone = customer?.phone ? String(customer.phone).replace(/\D/g, '') : "";
    const cleanAmount = Math.round(parseFloat(amount)); // Garante que seja inteiro (centavos)

    // --- 3. AUTENTICAÇÃO ALPHACASH ---
    const publicKey = process.env.ALPHACASH_PUBLIC_KEY;
    const secretKey = process.env.ALPHACASH_SECRET_KEY;
    
    if (!publicKey || !secretKey) {
      return res.status(500).json({ error: 'Configuração de chaves ausente no servidor (Env Vars)' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // --- 4. CHAMADA PARA API ALPHACASH ---
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: cleanAmount,
        paymentMethod: 'pix',
        pix: { expiresInDays: 1 },
        customer: {
          name: customer?.name || "Cliente",
          email: customer?.email || "",
          document: cleanDocument,
          phone: cleanPhone
        },
        items: items && items.length > 0 ? items.map(i => ({
          title: i.title || i.name || "Produto",
          unitPrice: Math.round(parseFloat(i.unitPrice || (cleanAmount / items.length))),
          quantity: parseInt(i.quantity || 1)
        })) : [{
          title: "Produto",
          unitPrice: cleanAmount,
          quantity: 1
        }],
        postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
      })
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) {
      console.error("AlphaCash Reject:", alphaData);
      return res.status(alphaResponse.status).json({ 
        error: 'AlphaCash recusou a transação', 
        details: alphaData 
      });
    }

    // --- 5. NOTIFICAÇÃO UTMIFY (Background) ---
    // Try/catch isolado para não impedir a geração do PIX se a Utmify falhar
    try {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': process.env.UTMIFY_TOKEN
        },
        body: JSON.stringify({
          orderId: String(alphaData.id),
          platform: "CacauShop",
          paymentMethod: 'pix',
          status: 'waiting_payment',
          createdAt: nowUtc,
          customer: {
            name: customer?.name,
            email: customer?.email,
            document: cleanDocument,
            phone: cleanPhone,
            ip: req.headers['x-forwarded-for'] || "127.0.0.1"
          },
          products: items?.map(i => ({
            id: String(i.id || "1"),
            name: i.title || i.name,
            quantity: 1,
            priceInCents: cleanAmount
          })) || [],
          trackingParameters: utm_data || {},
          commission: {
            totalPriceInCents: cleanAmount,
            gatewayFeeInCents: 0,
            userCommissionInCents: cleanAmount
          }
        })
      });
    } catch (e) {
      console.warn("Utmify falhou, mas o PIX foi gerado.");
    }

    // Retorno de sucesso para o frontend
    return res.status(200).json(alphaData);

  } catch (error) {
    console.error("Critical Error:", error);
    return res.status(500).json({ error: 'Erro interno no servidor', message: error.message });
  }
}
