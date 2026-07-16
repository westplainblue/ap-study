import { NavLink } from "react-router-dom";
import {
  IconChart,
  IconDoc,
  IconGear,
  IconHome,
  IconPencil,
} from "./Icons";

const tabs = [
  { to: "/", label: "ホーム", icon: IconHome, end: true },
  { to: "/practice", label: "演習", icon: IconPencil, end: false },
  { to: "/pm", label: "午後", icon: IconDoc, end: false },
  { to: "/stats", label: "分析", icon: IconChart, end: false },
  { to: "/settings", label: "設定", icon: IconGear, end: false },
];

export default function TabBar() {
  return (
    <nav className="tabbar">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
