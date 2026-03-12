export default async function handler(req, res) {
  const { transactionId } = req.query;

  try {
    const authAlpha = 'Basic ' + Buffer.from(process.env.ALPHACASH_PUBLIC_KEY + ':' + process.env.ALPHACASH_SECRET_KEY).toString('base64');

    const response = await fetch(`https://api.alphacashpay.com.br/v1/transactions/${transactionId}`, {
      headers: { 'Authorization': authAlpha }
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao consultar status' });
  }
}