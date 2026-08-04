import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { isTypingTarget } from "../lib/keys";
import { navCollapsed, setNavCollapsed } from "../lib/ui";
import {
  IconChart,
  IconChevronRight,
  IconClock,
  IconDoc,
  IconGear,
  IconHome,
  IconPencil,
  IconRefresh,
} from "./Icons";

/** 絵文字で代用するアイコン(Icons.tsx は線画SVGのみ。Home.tsx と同じ方針) */
function Emoji({ char }: { char: string }) {
  return (
    <span style={{ fontSize: 17, lineHeight: 1, width: 20, textAlign: "center" }} aria-hidden>
      {char}
    </span>
  );
}
const IconCalc = () => <Emoji char="🧮" />;
const IconVocab = () => <Emoji char="📒" />;

/**
 * PC(1024px以上)専用の左サイドバー。下部タブバーと排他で表示する。
 *
 * タブバーは5つに絞る必要があったが(下部固定の押しやすさの限界)、
 * サイドバーは縦に伸ばせるので**全モードを直接置ける**。これまでホームの
 * メニュー行を経由しないと辿れなかった計算ドリル・用語ノート・反復学習・模試が
 * 1クリックで開けるようになる。
 */
const GROUPS: {
  label: string;
  items: {
    to: string;
    label: string;
    // 線画アイコンは size を取るが絵文字版は取らない。両方受けられる形にする
    icon: (props: { size?: number }) => JSX.Element;
    end?: boolean;
  }[];
}[] = [
  {
    label: "",
    items: [{ to: "/", label: "ホーム", icon: IconHome, end: true }],
  },
  {
    label: "午前",
    items: [
      { to: "/practice", label: "分野別演習", icon: IconPencil },
      { to: "/drill", label: "反復学習", icon: IconRefresh },
      { to: "/calc", label: "計算ドリル", icon: IconCalc },
      { to: "/vocab", label: "用語ノート", icon: IconVocab },
      { to: "/mock", label: "模試", icon: IconClock },
    ],
  },
  {
    label: "午後",
    items: [{ to: "/pm", label: "午後演習", icon: IconDoc }],
  },
  {
    label: "その他",
    items: [
      { to: "/stats", label: "分析", icon: IconChart },
      { to: "/settings", label: "設定", icon: IconGear },
    ],
  },
];

export default function SideNav() {
  // 畳んだ状態は端末内に残す(次回もその幅で開く)
  const [collapsed, setCollapsed] = useState(navCollapsed);

  // 本文の左余白はCSS変数 --sidenav-w で連動させる(body のクラスで切り替え)
  useEffect(() => {
    document.body.classList.toggle("nav-collapsed", collapsed);
    return () => document.body.classList.remove("nav-collapsed");
  }, [collapsed]);

  const toggle = () =>
    setCollapsed((v) => {
      setNavCollapsed(!v);
      return !v;
    });

  // [ キーでも開閉できるようにする。演習の解答キー(1〜9 / A〜Z)と衝突せず、
  // 入力欄に文字を打っている間は横取りしない。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "[") return;
      if (isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <nav className="sidenav" aria-label="メインナビゲーション">
      <div className="sidenav-top">
        <span className="sidenav-brand">AP Study</span>
        <button
          className="sidenav-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "サイドバーを開く" : "サイドバーを畳む"}
          title={`${collapsed ? "開く" : "畳む"}([ キーでも切り替え)`}
        >
          <IconChevronRight size={16} />
        </button>
      </div>
      {GROUPS.map((g, gi) => (
        <div key={g.label || gi} className="sidenav-group">
          {g.label && <p className="sidenav-heading">{g.label}</p>}
          {g.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? "active" : "")}
              // 畳むとラベルが消えるので、ホバーで名前が分かるようにする
              title={collapsed ? label : undefined}
            >
              <Icon />
              <span className="sidenav-label">{label}</span>
              <span className="sidenav-chevron" aria-hidden>
                <IconChevronRight size={14} />
              </span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
