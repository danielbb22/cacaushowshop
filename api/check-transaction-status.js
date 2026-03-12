export default async function handler(req, res) {
  // 1. Liberação de CORS (Importante para o frontend não barrar)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const event = req.body;

    // 2. Lógica para quando o pagamento é confirmado pela AlphaCash
    if (event && (event.status === 'paid' || event.status === 'succeeded')) {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      
      // Notifica a Utmify em segundo plano
      fetch('https://api.utmify.com.br/api-credentials/orders', {
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
      }).catch(err => console.error("Erro Utmify Background:", err));
    }

    // 3. Resposta de Sucesso Universal
    // Retornamos um JSON que serve tanto para o Webhook quanto para o "fake" do frontend
    return res.status(200).json({ 
      status: "success", 
      message: "Processado",
      // Alguns scripts de IP esperam campos como esse abaixo:
      ip: req.headers['x-forwarded-for'] || "127.0.0.1" 
    });

  } catch (error) {
    // Mesmo em erro, retornamos 200 para não travar o frontend do site
    return res.status(200).json({ status: "error", message: "Silent fail" });
  }
}
