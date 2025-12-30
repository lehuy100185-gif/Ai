const chatBox = document.getElementById("chatBox");
const input = document.getElementById("input");

// Load lịch sử chat
const history = JSON.parse(localStorage.getItem("chat_history")) || [];
history.forEach(m => addMessage(m.role, m.text));

function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function send() {
    const msg = input.value.trim();
    if (!msg) return;

    addMessage("user", msg);
    history.push({ role: "user", text: msg });
    localStorage.setItem("chat_history", JSON.stringify(history));

    input.value = "";

    const typing = document.createElement("div");
    typing.className = "msg ai typing";
    typing.innerText = "AI đang trả lời...";
    chatBox.appendChild(typing);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg })
        });

        const data = await res.json();

        typing.remove();
        addMessage("ai", data.reply);

        history.push({ role: "ai", text: data.reply });
        localStorage.setItem("chat_history", JSON.stringify(history));

    } catch (err) {
        typing.innerText = "❌ Lỗi kết nối server";
    }
}

// Enter để gửi
input.addEventListener("keydown", e => {
    if (e.key === "Enter") send();
});