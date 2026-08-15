const http = require('http');

function postJson(urlPath, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: urlPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function runTest() {
    console.log("🚀 Testing GupShupp Auth System & Google 1-Tap...");
    const testUser = "testuser_" + Date.now();
    const testPass = "password123";

    // 1. Test Registration
    console.log("\n1. Testing Registration for:", testUser);
    const regRes = await postJson('/api/register', { username: testUser, password: testPass, avatar: '🦁' });
    console.log("Register response:", regRes.status, regRes.data);
    if (!regRes.data.success) throw new Error("Registration failed");

    // 2. Test Duplicate Registration (should fail cleanly)
    console.log("\n2. Testing Duplicate Registration (should return user exists error):");
    const dupRes = await postJson('/api/register', { username: testUser, password: testPass, avatar: '🦁' });
    console.log("Duplicate register response:", dupRes.status, dupRes.data);

    // 3. Test Login
    console.log("\n3. Testing Login with correct password:");
    const logRes = await postJson('/api/login', { username: testUser, password: testPass });
    console.log("Login response:", logRes.status, logRes.data?.username, "Success:", logRes.data?.success);
    if (!logRes.data.success) throw new Error("Login failed");

    // 4. Test Google 1-Tap Auth (New Account)
    const googleEmail = `rahul_${Date.now()}@gmail.com`;
    console.log("\n4. Testing Google 1-Tap Auth (New User):", googleEmail);
    const gAuth1 = await postJson('/api/auth/google', { email: googleEmail, name: 'Rahul M', avatar: '🌟' });
    console.log("Google Auth 1 response:", gAuth1.status, gAuth1.data?.username, "Success:", gAuth1.data?.success);
    if (!gAuth1.data.success) throw new Error("Google Auth new user failed");

    // 5. Test Google 1-Tap Auth (Existing Account Login)
    console.log("\n5. Testing Google 1-Tap Auth (Existing User Login):", googleEmail);
    const gAuth2 = await postJson('/api/auth/google', { email: googleEmail, name: 'Rahul M', avatar: '🌟' });
    console.log("Google Auth 2 response:", gAuth2.status, gAuth2.data?.username, "Success:", gAuth2.data?.success);
    if (!gAuth2.data.success) throw new Error("Google Auth existing user login failed");

    console.log("\n✅ ALL AUTH & GOOGLE 1-TAP TESTS PASSED 100%!");
}

runTest().catch(err => {
    console.error("❌ Test error:", err.message);
    process.exit(1);
});
