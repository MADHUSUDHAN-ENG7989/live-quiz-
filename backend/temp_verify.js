
import http from 'http';

function testLogin(userid, description) {
    const postData = JSON.stringify({ userid: userid, pswd: 'kmit' });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/check-user',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`[${description}] Response for ${userid}: ${data}`);
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
}

console.log("Starting verification...");
// The DB has "24BD1A0581" (Uppercase)
testLogin('24bd1a0581', 'LOWERCASE INPUT'); 
testLogin('24BD1A0581', 'UPPERCASE INPUT');
testLogin('24Bd1A0581', 'MIXED CASE INPUT');
