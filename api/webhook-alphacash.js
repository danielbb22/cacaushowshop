export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send();

  try {
    const event = req.body; // A AlphaCash envia os dados da transação aqui
    
    // Verificamos se o status é 'paid' ou 'succeeded' conforme AlphaCash
    if (event.status === 'paid' || event.status === 'succeeded') {
      
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];

      // Notificar Utmify que o status agora é PAID
      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': process.env.UTMIFY_TOKEN
        },
        body: JSON.stringify({
          orderId: event.id, // O mesmo ID enviado anteriormente
          status: 'paid',
          approvedDate: nowUtc,
          // Re-enviamos os dados básicos para garantir o match
          customer: { email: event.customer.email },
          paymentMethod: 'pix'
        })
      });
    }

    return res.status(200).send('OK');
  } catch (error) {
    return res.status(500).send('Error');
  }
}