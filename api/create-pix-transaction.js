export default async function handler(req, res) {
  // 1. CORS e Headers de Segurança
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { amount, customer, items, utm_data } = req.body;

    // 2. Chaves de Autenticação (Basic Auth)
    const publicKey = process.env.ALPHACASH_PUBLIC_KEY;
    const secretKey = process.env.ALPHACASH_SECRET_KEY;
    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // 3. Limpeza de Dados (CPF, Telefone e Centavos)
    const rawDoc = customer?.document?.number || customer?.document || "";
    const cleanDoc = String(rawDoc).replace(/\D/g, '');
    const cleanPhone = customer?.phone ? String(customer.phone).replace(/\D/g, '') : "11999999999";
    const cleanAmount = Math.round(parseFloat(amount));

    // 4. Montagem do Payload estrito para AlphaCash
    const payload = {
      amount: cleanAmount,
      paymentMethod: 'pix',
      pix: { expiresInDays: 1 },
      customer: {
        name: customer?.name || "Cliente",
        email: customer?.email || "cliente@email.com",
        phone: cleanPhone,
        document: {
          number: cleanDoc,
          type: "cpf" // Forçado em minúsculo para evitar erro 400
        }
      },
      items: items && items.length > 0 ? items.map(i => ({
        title: i.title || i.name || "Produto",
        unitPrice: Math.round(parseFloat(i.unitPrice || (cleanAmount / items.length))),
        quantity: parseInt(i.quantity || 1),
        tangible: true 
      })) : [{
        title: "Produto",
        unitPrice: cleanAmount,
        quantity: 1,
        tangible: true
      }],
      postbackUrl: `https://${req.headers.host}/api/webhook-alphacash`
    };

    // 5. Chamada para AlphaCash
    const alphaResponse = await fetch('https://api.alphacashpay.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const alphaData = await alphaResponse.json();

    if (!alphaResponse.ok) {
      return res.status(alphaResponse.status).json(alphaData);
    }

    // 6. Integração UTMify (Silenciosa em Background)
    try {
      const nowUtc = new Date().toISOString().replace('T', ' ').split('.')[0];
      fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': process.env.UTMIFY_TOKEN
        },
        body: JSON.stringify({
          orderId: String(alphaData.id),
          status: 'waiting_payment',
          createdAt: nowUtc,
          customer: { name: customer?.name, email: customer?.email, document: cleanDoc, phone: cleanPhone },
          trackingParameters: utm_data || {}
        })
      }).catch(() => {}); 
    } catch (e) {}

    // 7. RESPOSTA DE SUCESSO BLINDADA
    // Injetamos o qrcode na raiz para o frontend achar de qualquer jeito
    return res.status(200).json({
      ...alphaData,
      success: true,
      pix_code: alphaData.pix?.qrcode, 
      qrcode: alphaData.pix?.qrcode,
      status: "waiting_payment"
    });

  } catch (error) {
    return res.status(500).json({ error: "Erro interno", message: error.message });
  }
}
