export default async function handler(req, res) {
  // Configuração de CORS para permitir que o frontend acesse a API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { amount, customer, items, metadata, utm_data } = req.body;

    // 1. Configuração de Autenticação (Basic Auth)
    const publicKey = process.env.ALPHACASH_PUBLIC_KEY;
    const secretKey = process.env.ALPHACASH_SECRET_KEY;
    
    if (!publicKey || !secretKey) {
      return res.status(500).json({ error: 'Chaves da API não configuradas na Vercel.' });
    }

    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // 2. Tratamento e Limpeza de Dados
    const rawDoc = customer?.document?.number || customer?.document || "";
    const cleanDoc = String(rawDoc).replace(/\D/g, '');
    
    const cleanPhone = customer?.phone ? String(customer.phone).replace(/\D/g, '') : "11999999999";
    const cleanAmount = Math.round(parseFloat(amount));

    // 3. Montagem do Payload estrito para AlphaCash
    const payload = {
      amount: cleanAmount,
      paymentMethod: 'pix',
      pix: {
        expiresInDays: 1
      },
      customer: {
        name: customer?.name || "Cliente",
        email: customer?.email || "seu@gmail.com",
        phone: cleanPhone,
        document: {
          number: cleanDoc,
          type: "cpf" // Exatamente como exigido pelo erro 400
        }
      },
      // Itens obrigatórios com campo 'tangible'
      items: items && items.length > 0 ? items.map(i => ({
        title: i.title || i.name || "Produto",
        unitPrice: Math.round(parseFloat(i.unitPrice || (cleanAmount / items.length))),
        quantity: parseInt(i.quantity || 1),
        tangible: true 
      })) : [{
        title: "Produto",
        unitPrice: cleanAmount,
        quantity: 1,
        tangible: true
      }],
      postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
    };

    // 4. Chamada para a API AlphaCash
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) {
      return res.status(alphaResponse.status).json({
        error: "AlphaCash recusou a transação",
        details: alphaData
      });
    }

    // 5. Integração Utmify em Background (Não trava a resposta do PIX)
    try {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      fetch('https://api.utmify.com.br/api-credentials/orders', {
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
            document: cleanDoc,
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
      }).catch(() => {}); // Ignora erros da Utmify para não travar o cliente
    } catch (e) {}

    // 6. Retorno de Sucesso para o Frontend
    return res.status(200).json(alphaData);

  } catch (error) {
    console.error("Erro na API:", error);
    return res.status(500).json({ 
      error: "Erro interno", 
      message: error.message 
    });
  }
}
