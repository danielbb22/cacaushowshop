export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const event = req.body;

    if (event.status === 'paid' || event.status === 'succeeded') {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      
      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': process.env.UTMIFY_TOKEN
        },
        body: JSON.stringify({
          orderId: String(event.id),
          status: 'paid',
          approvedDate: nowUtc,
          paymentMethod: 'pix'
        })
      });
    }
    return res.status(200).send('OK');
  } catch (error) {
    return res.status(500).send('Webhook Error');
  }
}
