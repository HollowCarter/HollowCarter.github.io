const canvas = document.getElementById("background");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function drawRandomDots(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;

        // Random colour
        ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
        
        // Draw
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

window.addEventListener("resize", () => {
    resizeCanvas();
    drawRandomDots(10000);
});

resizeCanvas();
drawRandomDots(10000);