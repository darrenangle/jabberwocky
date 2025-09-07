import React, { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";

export default function Header() {
  const [subtitle, setSubtitle] = useState(0);
  const subtitles = ["Quantifying the poetic skill of large language models"];
  const { level = "minimal" } = useParams();
  const tabs = [
    { to: `/${level}/overview`, label: "Overview" },
    { to: `/${level}/analysis`, label: "Analysis" },
    { to: `/${level}/poem`, label: "Poems" },
    { to: `/${level}/about`, label: "Why" },
    { to: `/${level}/methods`, label: "Methods" },
  ];

  useEffect(() => {
    const interval = setInterval(() => setSubtitle((prev) => (prev + 1) % subtitles.length), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">Jabberwocky Bench</h1>
        </div>
        <nav className="header-nav">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `nav-button ${isActive ? "active" : ""}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
