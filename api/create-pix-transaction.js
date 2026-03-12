export default async function handler(req, res) {
  // CORS - Permite que seu frontend chame a API
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { amount, customer, items, utm_data } = req.body;

    // Verificar se as chaves existem
    if (!process.env.ALPHACASH_PUBLIC_KEY || !process.env.ALPHACASH_SECRET_KEY) {
      return res.status(500).json({ error: 'Configuração de chaves ausente no servidor' });
    }

    const authAlpha = 'Basic ' + Buffer.from(`${process.env.ALPHACASH_PUBLIC_KEY}:${process.env.ALPHACASH_SECRET_KEY}`).toString('base64');

    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': authAlpha,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: parseInt(amount),
        paymentMethod: 'pix',
        pix: { expiresInDays: 1 },
        customer: customer,
        items: items
      }),
    });

    const alphaData = await alphaResponse.json();

    if (alphaResponse.ok) {
      // Envio para Utmify (Opcional: não trava a resposta se falhar)
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
              document: customer.document,
              ip: req.headers['x-forwarded-for'] || "127.0.0.1"
            },
            products: items.map(i => ({
              id: "1",
              name: i.title || "Produto",
              quantity: 1,
              priceInCents: parseInt(amount)
            })),
            trackingParameters: utm_data || {},
            commission: {
              totalPriceInCents: parseInt(amount),
              gatewayFeeInCents: 0,
              userCommissionInCents: parseInt(amount)
            }
          })
        });
      } catch (e) { console.error("Erro Utmify:", e); }

      return res.status(200).json(alphaData);
    } else {
      return res.status(alphaResponse.status).json({ error: 'Erro AlphaCash', details: alphaData });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}