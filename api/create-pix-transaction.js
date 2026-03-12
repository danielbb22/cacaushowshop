export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const { amount, customer, items, utm_data } = body;

    // 1. AUTENTICAÇÃO ALPHACASH
    const authAlpha = 'Basic ' + Buffer.from(process.env.ALPHACASH_PUBLIC_KEY + ':' + process.env.ALPHACASH_SECRET_KEY).toString('base64');

    // 2. CRIAR TRANSAÇÃO NA ALPHACASH
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': authAlpha,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
        paymentMethod: 'pix',
        pix: { expiresInDays: 1 },
        customer: customer,
        items: items,
        postbackUrl: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/webhook-alphacash`
      }),
    });

    const alphaData = await alphaResponse.json();

    if (alphaResponse.ok) {
      // 3. ENVIAR PARA UTMIFY (STATUS: WAITING_PAYMENT)
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      
      const utmifyPayload = {
        orderId: alphaData.id || `order_${Date.now()}`,
        platform: "VercelCheckout",
        paymentMethod: 'pix',
        status: 'waiting_payment',
        createdAt: nowUtc,
        approvedDate: null,
        refundedAt: null,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone || null,
          document: customer.document || null,
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        },
        products: items.map(item => ({
          id: item.id || '1',
          name: item.title || item.name,
          quantity: item.quantity || 1,
          priceInCents: item.unitPrice || amount
        })),
        trackingParameters: {
          src: utm_data?.src || null,
          sck: utm_data?.sck || null,
          utm_source: utm_data?.utm_source || null,
          utm_medium: utm_data?.utm_medium || null,
          utm_campaign: utm_data?.utm_campaign || null,
          utm_content: utm_data?.utm_content || null,
          utm_term: utm_data?.utm_term || null
        },
        commission: {
          totalPriceInCents: amount,
          gatewayFeeInCents: Math.round(amount * 0.05), // Simulação de 5% de taxa
          userCommissionInCents: Math.round(amount * 0.95)
        }
      };

      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': process.env.UTMIFY_TOKEN
        },
        body: JSON.stringify(utmifyPayload)
      });
    }

    return res.status(alphaResponse.status).json(alphaData);

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}