const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

const badBlock = `app.get("/", (req, res) => {
    const user = new logindata({ userid, password: hashedPassword, role, section: role === 'student' ? section : null });
    await user.save();
    res.json({ message: "Login data saved successfully!" });
  } catch (err) {`;

const goodBlock = `app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      message: 'HTTP Request',
      method: req.method,
      route: req.url,
      status: res.statusCode,
      duration: \`\${duration}ms\`
    });
    
    httpRequestDurationMicroseconds
      .labels(req.method, req.url, res.statusCode)
      .observe(duration / 1000);
  });
  next();
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.get('/api/metrics/json', async (req, res) => {
    try {
        res.json(await register.getMetricsAsJSON());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTH ROUTES (Placed at top to ensure priority) ---

app.post("/register", async (req, res) => {
  try {
    const { userid, password, role, section } = req.body;
    if (!userid || !password || !role) {
      return res.status(400).json({ message: "Missing userid, password, or role" });
    }
    let check = await logindata.findOne({ userid });
    if (check) {
      return res.json({ message: "USER ID already exist!" });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new logindata({ userid, password: hashedPassword, role, section: role === 'student' ? section : null });
    await user.save();
    res.json({ message: "Login data saved successfully!" });
  } catch (err) {`;

if (content.includes(badBlock)) {
    console.log("Found bad block. Replacing...");
    const newContent = content.replace(badBlock, goodBlock);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log("Fixed server.js");
} else {
    console.log("Bad block NOT found. Dumping a snippet to see what's wrong:");
    const start = content.indexOf('app.get("/", (req, res) => {');
    if (start !== -1) {
        console.log(JSON.stringify(content.substring(start, start + 200)));
    } else {
        console.log("Could not find start of bad block.");
    }
}
