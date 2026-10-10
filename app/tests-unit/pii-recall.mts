// Integration test: measures PII recall via the Presidio HTTP service (spaCy NER + regex).
// Requires the pii-service running: cd pii-service && uvicorn main:app --port 8010
// PII_SERVICE_URL env var defaults to http://localhost:8010.
import { redactTexts } from "../lib/pii";

const pii: [string, string][] = [
  ["Reach me at rahul.sharma@gmail.com please", "rahul.sharma@gmail.com"],
  ["email priya_nair99@outlook.com for the quote", "priya_nair99@outlook.com"],
  ["my work mail is j.smith@acme-corp.co.uk", "j.smith@acme-corp.co.uk"],
  ["contact sales.team@earthtek.in", "sales.team@earthtek.in"],
  ["send to a.b+tag@example.org", "a.b+tag@example.org"],
  ["phone +91 98765 43210", "98765 43210"],
  ["call me on 9876543210", "9876543210"],
  ["my number is +1 (415) 555-0132", "555-0132"],
  ["WhatsApp 98450 12345 anytime", "98450 12345"],
  ["tel: 044 2345 6789", "2345 6789"],
  ["ring +44 20 7946 0958", "7946 0958"],
  ["mobile 8123456789", "8123456789"],
  ["Card 4111 1111 1111 1111 exp 12/27", "4111 1111 1111 1111"],
  ["pay with 5500-0000-0000-0004", "5500-0000-0000-0004"],
  ["my visa 4012888888881881", "4012888888881881"],
  ["amex 378282246310005", "378282246310005"],
  ["I am John Smith and need a lens", "John Smith"],
  ["my name is Priya Nair", "Priya Nair"],
  ["this is Ramesh Kumar from Pune", "Ramesh Kumar"],
  ["Regards, Anita Deshmukh", "Anita Deshmukh"],
  ["Hello, I'm Michael Johnson", "Michael Johnson"],
  ["contact Dr. Sarah Williams about it", "Sarah Williams"],
  ["ask Vikram Singh to call", "Vikram Singh"],
  ["my colleague Meera Iyer will join", "Meera Iyer"],
  ["PAN ABCDE1234F", "ABCDE1234F"],
  ["pan number is BNZPM2501F", "BNZPM2501F"],
  ["Aadhaar 2345 6789 0123", "2345 6789 0123"],
  ["my aadhaar: 4567 8901 2345", "4567 8901 2345"],
  ["SSN 123-45-6789", "123-45-6789"],
  ["social security 219-09-9999", "219-09-9999"],
  ["passport K1234567", "K1234567"],
  ["passport no. Z7654321", "Z7654321"],
  ["server ip 192.168.1.10", "192.168.1.10"],
  ["connect to 10.0.0.254 now", "10.0.0.254"],
  ["gateway 172.16.254.1", "172.16.254.1"],
  ["IBAN GB82 WEST 1234 5698 7654 32", "GB82 WEST 1234 5698 7654 32"],
  ["iban DE89370400440532013000", "DE89370400440532013000"],
  ["email me: kiran@startup.io or call 9988776655", "kiran@startup.io"],
  ["email me: kiran@startup.io or call 9988776655", "9988776655"],
  ["I'm Aditi Rao, aditi.rao@mail.com, 9123456780", "Aditi Rao"],
  ["I'm Aditi Rao, aditi.rao@mail.com, 9123456780", "aditi.rao@mail.com"],
  ["I'm Aditi Rao, aditi.rao@mail.com, 9123456780", "9123456780"],
  ["card 4242 4242 4242 4242 name Rohan Mehta", "4242 4242 4242 4242"],
  ["card 4242 4242 4242 4242 name Rohan Mehta", "Rohan Mehta"],
  ["write to lena.fischer@web.de", "lena.fischer@web.de"],
  ["Sanjay Gupta here, need a quote", "Sanjay Gupta"],
  ["ph: (212) 555-0198", "555-0198"],
  ["call 080-4567-8901", "4567-8901"],
  ["backup mail finance@bigco.com", "finance@bigco.com"],
  ["user Neha Kapoor asked", "Neha Kapoor"],
  ["Thanks, David Brown", "David Brown"],
  ["PAN: AAAPL1234C and mobile 7012345678", "AAAPL1234C"],
  ["PAN: AAAPL1234C and mobile 7012345678", "7012345678"],
  ["host 203.0.113.42 is down", "203.0.113.42"],
  ["Aadhaar number 3456 7890 1234 linked", "3456 7890 1234"],
  ["my passport is P1234567", "P1234567"],
  ["contact: Isabella Rossi", "Isabella Rossi"],
];
const technical = [
  "Calculate focal length: sensor 8.8 mm, FOV 100 mm, working distance 300 mm",
  "3.5 mm, 100mm, 45mm, f/2.8, 1/1000 s, 2/3 inch sensor, 5 MP, C-mount",
  "Model LM16JC10M at 500 mm with 12.5 mm pixel 3.45 um",
  "What does EarthTekniks do? Tell me about Garuda inspection system, speed 18,000 bottles/hour",
  "Which lens suits a 1.1 inch sensor with 4096 pixels and 7 um pitch?",
  "depth of field at f/5.6, 25 mm lens, 0.5 m distance",
  "line scan 16k 3.5 um pixel at 12 kHz line rate",
  "Compare LM8HC and LM12HC for 2/3 inch sensors",
  "What is the exposure for 1200 mm/s conveyor speed with 0.1 mm blur?",
  "Show me families of lenses for a 2.2 MP camera",
  "Does the Garuda system inspect 28 mm neck finish bottles?",
  "working distance 300 to 450 mm, FOV 120 x 90 mm",
  "sensor 1/1.8 inch, pixel size 2.4 um, 2448 x 2048",
  "my project uses a 12 MP camera at 30 fps over GigE",
  "I need a telecentric lens with 0.5x magnification",
];

const redacted = await redactTexts([...pii.map((p) => p[0]), ...technical]);
let miss = 0;
const misses: string[] = [];
pii.forEach(([_, secret], i) => {
  if (redacted[i].includes(secret)) {
    miss++;
    misses.push(`${secret}  =>  ${redacted[i]}`);
  }
});
let fp = 0;
technical.forEach((t, k) => {
  const r = redacted[pii.length + k];
  if (r !== t) {
    fp++;
    console.log("FALSE POSITIVE:", t, "=>", r);
  }
});
const recall = (pii.length - miss) / pii.length;
console.log(`PII items: ${pii.length}, caught: ${pii.length - miss}, recall: ${(recall * 100).toFixed(1)}%`);
console.log(`Technical sentences: ${technical.length}, altered: ${fp}`);
if (misses.length) console.log("MISSED:\n  " + misses.join("\n  "));
if (recall < 0.9 || fp > 0) process.exit(1);
