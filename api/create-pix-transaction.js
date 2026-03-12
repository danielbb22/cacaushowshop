export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, customer, items, utm_data } = req.body;

    // 1. Limpeza de dados (Evita Erro 400)
    const cleanDocument = customer?.document?.replace(/\D/g, '') || "";
    const cleanPhone = customer?.phone?.replace(/\D/g, '') || "";
    const cleanAmount = Math.round(parseFloat(amount)); // Garante centavos inteiros

    const authHeader = 'Basic ' + Buffer.from(`${process.env.ALPHACASH_PUBLIC_KEY}:${process.env.ALPHACASH_SECRET_KEY}`).toString('base64');

    // 2. Chamada AlphaCash
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
          name: customer.name || "Cliente",
          email: customer.email || "",
          document: cleanDocument,
          phone: cleanPhone
        },
        items: items.map(i => ({
          title: i.title || i.name || "Produto",
          unitPrice: Math.round(parseFloat(i.unitPrice || amount)),
          quantity: parseInt(i.quantity || 1)
        })),
        postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
      })
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) {
      console.error("Erro AlphaCash Detalhado:", alphaData);
      return res.status(400).json({ error: 'AlphaCash recusou os dados', details: alphaData });
    }

    // 3. Notificar Utmify (Silencioso para não travar o PIX)
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
          platform: "VercelShop",
          paymentMethod: 'pix',
          status: 'waiting_payment',
          createdAt: nowUtc,
          customer: {
            name: customer.name,
            email: customer.email,
            document: cleanDocument,
            phone: cleanPhone,
            ip: req.headers['x-forwarded-for'] || "127.0.0.1"
          },
          products: items.map(i => ({
            id: String(i.id || "1"),
            name: i.title || i.name,
            quantity: 1,
            priceInCents: cleanAmount
          })),
          trackingParameters: utm_data || {},
          commission: {
            totalPriceInCents: cleanAmount,
            gatewayFeeInCents: 0,
            userCommissionInCents: cleanAmount
          }
        })
      });
    } catch (e) { console.warn("Utmify Offline"); }

    return res.status(200).json(alphaData);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
