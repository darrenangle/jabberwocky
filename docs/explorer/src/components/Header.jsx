import React, { useEffect, useState } from "react";

export default function Header({ activeTab, onTabChange }) {
  const [subtitle, setSubtitle] = useState(0);
  const subtitles = ["Quantifying the poetic skill of large language models"];
  const tabs = [
    { id: "leaderboard", label: "Overview" },
    { id: "analysis", label: "Analysis" },
    { id: "verses", label: "Poems" },
    { id: "about", label: "Why" },
    { id: "methodology", label: "Methods" },
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
            <button
              key={tab.id}
              className={`nav-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

