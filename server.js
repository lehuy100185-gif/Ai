import express from "express";
import cors from "cors";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;
const JWT_SECRET = "chatgpt-mini-secret";

const USERS_FILE = "./data/users.json";
const CHAT_FILE = "./data/chats.json";

/* ================= INIT ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= FILE HELPERS ================= */
function ensureFile(file, initData) {
    if (!fs.existsSync("data")) fs.mkdirSync("data");
    if (!fs.existsSync(file)) fs.writeFileSync(file, initData);
}

function readJSON(file, initData = "{}") {
    ensureFile(file, initData);
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return JSON.parse(initData);
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= TOKEN ================= */
function getUsernameFromReq(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return null;

    try {
        const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET);
        return decoded.username;
    } catch {
        return null;
    }
}

/* ================= REGISTER ================= */
app.post("/register", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE, "{}");

    // ✅ chặn trùng tên tuyệt đối
    if (users[username])
        return res.json({ error: "Tên người dùng đã tồn tại" });

    const hash = await bcrypt.hash(password, 10);
    users[username] = { password: hash };

    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

/* ================= LOGIN ================= */
app.post("/login", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE, "{}");

    const user = users[username];
    if (!user) return res.json({ error: "Sai tài khoản" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: "Sai mật khẩu" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, username });
});

/* ================= CHAT (GIỮ CONTEXT) ================= */
app.post("/chat", async(req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.json({ reply: "❌ Không có nội dung" });

        const username = getUsernameFromReq(req);

        let messages = [{
            role: "system",
            content: "Bạn là trợ lý AI tiếng Việt. Trả lời ngắn gọn, đúng trọng tâm."
        }];

        // ✅ nạp context cũ
        if (username) {
            const chats = readJSON(CHAT_FILE, "{}");
            const history = chats[username] || [];
            messages.push(...history.slice(-10)); // lấy 10 tin gần nhất
        }

        messages.push({ role: "user", content: message });

        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "qwen2.5:1.5b",
                messages,
                options: {
                    num_predict: 200,
                    temperature: 0.2
                },
                stream: false
            })
        });

        const data = await response.json();

        if (!data.message || !data.message.content) {
            console.error("OLLAMA RAW:", data);
            return res.json({ reply: "❌ Ollama không trả lời" });
        }
        // ✅ lưu lịch sử
        if (username) {
            const chats = readJSON(CHAT_FILE, "{}");
            if (!chats[username]) chats[username] = [];

            chats[username].push({ role: "user", content: message }, { role: "assistant", content: data.message.content });

            writeJSON(CHAT_FILE, chats);
        }

        res.json({ reply: data.message.content });

    } catch (err) {
        console.error(err);
        res.json({ reply: "❌ Server lỗi" });
    }
});

/* ================= LOAD HISTORY ================= */
app.get("/history", (req, res) => {
    const username = getUsernameFromReq(req);
    if (!username) return res.json([]);

    const chats = readJSON(CHAT_FILE, "{}");
    res.json(chats[username] || []);
});

/* ================= CLEAR HISTORY ================= */
app.delete("/history", (req, res) => {
    const username = getUsernameFromReq(req);
    if (!username) return res.json({ error: "Chưa đăng nhập" });

    const chats = readJSON(CHAT_FILE, "{}");
    delete chats[username];
    writeJSON(CHAT_FILE, chats);

    res.json({ success: true });
});

/* ================= START ================= */
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});