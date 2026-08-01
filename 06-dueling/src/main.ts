const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (ctx) {
  ctx.fillStyle = "#cfd3da";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText("06-dueling: scaffold OK", 20, 30);
}
