require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

app.post('/voice', async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });

  gather.say('Bonjour, je suis Thomas, enchanté. J’ai vu que vous étiez intéressé par une installation. Pouvez-vous m’en dire plus ?');

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process', async (req, res) => {
  const userSpeech = req.body.SpeechResult;
  const leadPhone = req.body.From;

  const openAiResponse = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Tu es un conseiller vocal commercial sérieux et agréable.'
        },
        {
          role: 'user',
          content: userSpeech
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const iaResponse = openAiResponse.data.choices[0].message.content;

  // Générer le fichier audio avec ElevenLabs
  const audio = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
    {
      text: iaResponse,
      model_id: "eleven_monolingual_v1"
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    }
  );

  // Préparer la réponse TwiML avec la voix
  const twiml = new twilio.twiml.VoiceResponse();
  const audioBuffer = Buffer.from(audio.data, 'binary').toString('base64');
  twiml.play({ loop: 1 }, `data:audio/mpeg;base64,${audioBuffer}`);

  res.type('text/xml');
  res.send(twiml.toString());

  // Optionnel : envoyer Calendly si la personne est intéressée
  if (iaResponse.includes('je t’envoie le lien pour réserver')) {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        To: leadPhone,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: `Voici mon lien pour réserver un appel : ${process.env.CALENDLY_LINK}`
      }),
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );
  }
});

app.listen(port, () => {
  console.log(`Serveur en ligne sur le port ${port}`);
});
