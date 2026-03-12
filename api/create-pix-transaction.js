export default async function handler(req, res) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Apenas POST permitido' });

  try {
    const { amount, customer, items, utm_data, metadata } = req.body;

    // --- 1. CONFIGURAÇÃO DE AUTENTICAÇÃO (Basic Auth) ---
    const publicKey = process.env.ALPHACASH_PUBLIC_KEY;
    const secretKey = process.env.ALPHACASH_SECRET_KEY;
    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // --- 2. TRATAMENTO DE DADOS DO CLIENTE ---
    const cleanDocument = customer?.document?.number 
      ? String(customer.document.number).replace(/\D/g, '') 
      : String(customer?.document).replace(/\D/g, '');

    const cleanPhone = customer?.phone ? String(customer.phone).replace(/\D/g, '') : "";

    // --- 3. CONSTRUÇÃO DO PAYLOAD (Seguindo estritamente a documentação) ---
    const payload = {
      amount: Math.round(parseFloat(amount)), // centavos
      paymentMethod: 'pix',
      pix: {
        expiresInDays: 1
      },
      customer: {
        name: customer?.name || "Cliente",
        email: customer?.email || "",
        phone: cleanPhone || "11999999999", // Valor padrão se vazio
        document: {
          number: cleanDocument,
          type: "cpf"
        }
      },
      // De acordo com o erro anterior, 'tangible' é obrigatório no objeto item
      items: items && items.length > 0 ? items.map(i => ({
        title: i.title || i.name || "Produto",
        unitPrice: Math.round(parseFloat(i.unitPrice || amount)),
        quantity: parseInt(i.quantity || 1),
        tangible: true 
      })) : [{
        title: "Produto",
        unitPrice: Math.round(parseFloat(amount)),
        quantity: 1,
        tangible: true
      }],
      metadata: metadata ? JSON.stringify(metadata) : "",
      postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
    };

    // --- 4. REQUISIÇÃO PARA ALPHACASH ---
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) {
      return res.status(alphaResponse.status).json({
        error: "AlphaCash Recusou",
        details: alphaData
      });
    }

    // --- 5. INTEGRAÇÃO UTMIFY (Background) ---
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
            priceInCents: Math.round(parseFloat(amount))
          })) || [],
          trackingParameters: utm_data || {},
          commission: {
            totalPriceInCents: Math.round(parseFloat(amount)),
            gatewayFeeInCents: 0,
            userCommissionInCents: Math.round(parseFloat(amount))
          }
        })
      });
    } catch (e) {
      console.log("Utmify skip");
    }

    // Sucesso
    return res.status(200).json(alphaData);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
}
