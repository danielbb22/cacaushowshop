export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { amount, customer, items, utm_data } = req.body;

    const publicKey = process.env.ALPHACASH_PUBLIC_KEY;
    const secretKey = process.env.ALPHACASH_SECRET_KEY;
    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    const cleanDoc = String(customer?.document?.number || customer?.document || "").replace(/\D/g, '');
    const cleanPhone = String(customer?.phone || "11999999999").replace(/\D/g, '');
    const cleanAmount = Math.round(parseFloat(amount));

    // 1. Chamada AlphaCash
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: cleanAmount,
        paymentMethod: 'pix',
        pix: { expiresInDays: 1 },
        customer: {
          name: customer?.name || "Cliente",
          email: customer?.email || "cliente@email.com",
          phone: cleanPhone,
          document: { number: cleanDoc, type: "cpf" }
        },
        items: [{ title: "Pedido Cacau", unitPrice: cleanAmount, quantity: 1, tangible: true }],
        postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
      })
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) return res.status(400).json(alphaData);

    // 2. RESPOSTA PARA O FRONTEND (A PARTE QUE DESTRAVA A TELA)
    // Injetamos todas as variações possíveis que o seu JS pode estar procurando
    return res.status(200).json({
      ...alphaData,
      success: true,
      pix_code: alphaData.pix?.qrcode, 
      qrcode: alphaData.pix?.qrcode,
      copy_and_paste: alphaData.pix?.qrcode,
      status: "waiting_payment"
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
