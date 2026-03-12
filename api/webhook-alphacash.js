export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;

  // Verifique o status enviado pela AlphaCash (ajuste conforme o retorno real deles)
  if (event.status === 'paid' || event.status === 'succeeded') {
    try {
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
    } catch (e) {
      console.error("Erro Webhook Utmify:", e);
    }
  }

  return res.status(200).send('Webhook Recebido');
}
