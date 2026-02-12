import React, { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function Wellness() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      const q = query(
        collection(db, "wellness"),
        where("userId", "==", currentUser.uid),
        orderBy("date", "asc")
      );

      const snap = await getDocs(q);

      const data = snap.docs.map((doc) => {
        const d = doc.data();

        const normalized =
          (d.sommeil +
            d.motivation +
            d.nutrition +
            d.hydratation +
            (10 - d.fatigue) +
            (10 - d.stress) +
            (10 - d.douleur)) /
          7;

        return {
          ...d,
          normalizedScore: Number(normalized.toFixed(2)),
        };
      });

      setEntries(data);
    };

    fetchData();
  }, [currentUser]);

  // Score quotidien : uniquement pour aujourd'hui
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = entries.find((e) => e.date === today);
  const dailyScore = todayEntry ? todayEntry.normalizedScore.toFixed(1) : null;

  // Score hebdomadaire : uniquement pour la semaine en cours
  const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  };

  const currentWeek = getWeekNumber(new Date());
  const currentYear = new Date().getFullYear();

  const thisWeekEntries = entries.filter((e) => {
    const entryDate = new Date(e.date);
    return (
      getWeekNumber(entryDate) === currentWeek &&
      entryDate.getFullYear() === currentYear
    );
  });

  const weeklyAverage =
    thisWeekEntries.length > 0
      ? (
          thisWeekEntries.reduce((sum, e) => sum + e.normalizedScore, 0) /
          thisWeekEntries.length
        ).toFixed(1)
      : null;

  const renderGraph = (key, label, color) => (
    <div style={{ marginBottom: 30 }}>
      <h4 style={{ color: "#ffffff", marginBottom: 15 }}>{label}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={entries}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="date" stroke="#888" />
          <YAxis domain={[0, 10]} stroke="#888" />
          <Tooltip
            contentStyle={{
              background: "#1a1a1a",
              border: "1px solid #444",
              borderRadius: 8,
            }}
            labelStyle={{ color: "#ffffff" }}
          />
          <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div
      style={{
        padding: 20,
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#ffffff",
      }}
    >
      <h2 style={{ color: "#ffffff", marginBottom: 10 }}>
        Wellness – Suivi détaillé
      </h2>
      <p style={{ color: "#b0b0b0", marginBottom: 30 }}>
        Suivez votre état de forme quotidien et votre récupération
      </p>

      <button
        onClick={() => navigate("/wellness-form")}
        style={{
          padding: "12px 24px",
          background: "#27ae60",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 30,
        }}
      >
        📝 Remplir le questionnaire
      </button>

      {/* Scores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            background: "#2a2a2a",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #2f80ed",
          }}
        >
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            SCORE D'AUJOURD'HUI
          </div>
          {dailyScore !== null ? (
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#2f80ed" }}>
              {dailyScore}
              <span style={{ fontSize: 24, marginLeft: 5 }}>/10</span>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "#888", padding: "20px 0" }}>
              Pas encore rempli aujourd'hui
            </div>
          )}
        </div>

        <div
          style={{
            background: "#2a2a2a",
            padding: 25,
            borderRadius: 12,
            border: "2px solid #27ae60",
          }}
        >
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            MOYENNE CETTE SEMAINE
          </div>
          {weeklyAverage !== null ? (
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#27ae60" }}>
              {weeklyAverage}
              <span style={{ fontSize: 24, marginLeft: 5 }}>/10</span>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "#888", padding: "20px 0" }}>
              Aucune donnée cette semaine
            </div>
          )}
        </div>
      </div>

      {/* Graphiques */}
      <div
        style={{
          background: "#2a2a2a",
          padding: 25,
          borderRadius: 12,
          border: "1px solid #444",
        }}
      >
        {entries.length > 0 ? (
          <>
            {renderGraph("normalizedScore", "Score global", "#2f80ed")}
            {renderGraph("fatigue", "Fatigue", "#f44336")}
            {renderGraph("stress", "Stress", "#ff9800")}
            {renderGraph("douleur", "Douleur", "#9c27b0")}
            {renderGraph("sommeil", "Sommeil", "#4caf50")}
            {renderGraph("nutrition", "Nutrition", "#2196f3")}
            {renderGraph("hydratation", "Hydratation", "#00bcd4")}
            {renderGraph("motivation", "Motivation", "#8bc34a")}
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "#b0b0b0",
            }}
          >
            <p style={{ fontSize: 18, margin: 0 }}>
              Aucune donnée pour le moment
            </p>
            <p style={{ fontSize: 14, margin: "10px 0 0 0" }}>
              Commencez à remplir votre questionnaire quotidien !
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
