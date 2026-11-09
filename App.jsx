import React from "react";
import { Routes, Route } from "react-router-dom";

import Layout from "./component/Layout";
import ProtectedRoute from "./auth/ProtectedRoute";

import Login from "./page/Login";
import Dashboard from "./page/Dashboard";
import Wellness from "./page/Wellness";
import WellnessForm from "./page/WellnessForm";
import Workout from "./page/Workout";
import Athletes from "./page/Athletes";
import Profile from "./page/MyProfile";
import MyRM from "./page/MyRM";
import ACWRMonitoring from "./page/ACWRMonitoring";
import Tests from "./page/Tests";
import Reference from "./page/Reference";
import Nutrition from "./page/Nutrition";
import Sleep from "./page/Sleep";
import Settings from "./page/Settings";
import { DialogHost } from "./component/appDialog";

export default function App() {
  return (
    <>
    <DialogHost />
    <Routes>
      {/* PUBLIC */}
      <Route path="/login" element={<Login />} />

      {/* PROTECTED */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/wellness" element={<Wellness />} />
          <Route path="/wellness-form" element={<WellnessForm />} />
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/acwr" element={<ACWRMonitoring />} />
          <Route path="/MyProfile" element={<Profile />} />
          <Route path="/myrm" element={<MyRM />} />
          <Route path="/tests" element={<Tests />} />
          <Route path="/reference" element={<Reference />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/sommeil" element={<Sleep />} />
          <Route path="/parametres" element={<Settings />} />
        </Route>
      </Route>
    </Routes>
    </>
  );
}
