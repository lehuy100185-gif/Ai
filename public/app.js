const input = document.getElementById("input");
const chatBox = document.getElementById("chatBox");
const sendBtn = document.getElementById("sendBtn");

sendBtn.addEventListener("click", send);

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
});

async function send() {
    const msg = input.value.trim();
    if (!msg) return;

    chatBox.innerHTML += `<div class="msg user">${msg}</div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

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
        chatBox.innerHTML += `<div class="msg ai">${data.reply}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

    } catch {
        typing.innerText = "❌ Lỗi kết nối server";
    }
}