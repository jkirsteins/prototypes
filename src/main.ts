import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <main class="shell">
    <h1>Escape Castle</h1>
    <p>Prototype scaffold ready.</p>
  </main>
`;
