import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth";

export default function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate("/"))
      .catch((err) => {
        console.error("Callback error:", err);
        navigate("/");
      });
  }, [navigate]);

  return (
    <div style={{ fontFamily: "sans-serif", textAlign: "center", marginTop: 80 }}>
      <p>ログイン処理中...</p>
    </div>
  );
}
