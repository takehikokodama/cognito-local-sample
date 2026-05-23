import { useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import { userManager } from "../auth";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    userManager.getUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login = () => userManager.signinRedirect();
  const logout = () => userManager.signoutRedirect();

  if (loading) return <div style={styles.container}>読み込み中...</div>;

  return (
    <div style={styles.container}>
      <h1>Cognito Local Sample</h1>
      {user ? (
        <div>
          <p>
            ✅ ログイン中: <strong>{user.profile.email as string}</strong>
          </p>
          <p style={{ color: "#666", fontSize: 14 }}>
            グループ:{" "}
            {((user.profile["cognito:groups"] as string[]) ?? []).join(", ")}
            　テナント: {user.profile["custom:tenant_id"] as string}
          </p>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate("/protected")} style={styles.btn}>
              API を叩く
            </button>
            <button
              onClick={logout}
              style={{ ...styles.btn, marginLeft: 8, background: "#666" }}
            >
              ログアウト
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p>未ログインです。</p>
          <button onClick={login} style={styles.btn}>
            ログイン
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "sans-serif",
    maxWidth: 600,
    margin: "80px auto",
    padding: "0 16px",
  },
  btn: {
    padding: "10px 20px",
    fontSize: 15,
    cursor: "pointer",
    background: "#0066cc",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
};
