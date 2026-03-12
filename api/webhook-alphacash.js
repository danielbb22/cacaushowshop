export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Se for o pagamento real da AlphaCash avisando que foi pago
  if (req.body && (req.body.status === 'paid' || req.body.status === 'succeeded')) {
    try {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': process.env.UTMIFY_TOKEN },
        body: JSON.stringify({
          orderId: String(req.body.id),
          status: 'paid',
          approvedDate: nowUtc,
          paymentMethod: 'pix'
        })
      });
    } catch (e) { console.error("Erro Utmify:", e); }
  }

  // RESPOSTA MÁGICA: Engana o SDK do Supabase e o IPAPI
  return res.status(200).json({ 
    status: "success", 
    data: { success: true }, // O que o SDK do Supabase espera
    ip: "127.0.0.1" 
  });
}
