import { NavLink } from "react-router-dom";
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
  return (
    <nav className="sidenav" aria-label="メインナビゲーション">
      <div className="sidenav-brand">AP Study</div>
      {GROUPS.map((g, gi) => (
        <div key={g.label || gi} className="sidenav-group">
          {g.label && <p className="sidenav-heading">{g.label}</p>}
          {g.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? "active" : "")}
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
