// /free/ 共通: 各ページ下の「ほかのツールとゲーム」を並べる。新しいページを足したらここに 1 行足す
const FREE_ITEMS = [
  { slug: "moji", ico: "🔤", name: "文字数カウント", desc: "空白・改行なしや原稿用紙の枚数も同時に", kind: "tool" },
  { slug: "nenrei", ico: "🎂", name: "年齢・和暦の早見", desc: "生年月日から満年齢・干支・和暦がすぐ分かる", kind: "tool" },
  { slug: "mine", ico: "💣", name: "マインスイーパー", desc: "スマホでも遊べる。旗は長押しで", kind: "game" },
];

function freeTile(it) {
  const a = document.createElement("a");
  a.className = "tile";
  a.href = (document.body.dataset.root || "../") + it.slug + "/";
  a.innerHTML = `<span class="ico" aria-hidden="true">${it.ico}</span><b></b><small></small><span class="tag${it.kind === "game" ? " game" : ""}">${it.kind === "game" ? "ゲーム" : "ツール"}</span>`;
  a.querySelector("b").textContent = it.name;
  a.querySelector("small").textContent = it.desc;
  return a;
}

document.querySelectorAll("[data-more]").forEach(box => {
  const self = box.dataset.more;
  const kind = box.dataset.kind;
  FREE_ITEMS.filter(it => it.slug !== self && (!kind || it.kind === kind)).forEach(it => box.appendChild(freeTile(it)));
});
