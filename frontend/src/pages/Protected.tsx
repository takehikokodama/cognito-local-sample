import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth";

interface ApiResult {
  status: number;
  data: unknown;
  error?: string;
}

export default function Protected() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, ApiResult>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    userManager.getUser().then((user) => {
      if (!user) navigate("/");
    });
  }, [navigate]);

  const callApi = async (path: string) => {
    const user = await userManager.getUser();
    if (!user) {
      navigate("/");
      return;
    }

    setLoading(path);
    try {
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });
      const data: unknown = await res.json();
      setResults((prev) => ({ ...prev, [path]: { status: res.status, data } }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [path]: { status: 0, data: null, error: String(e) },
      }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={styles.container}>
      <h1>Protected Page</h1>
      <button onClick={() => navigate("/")} style={styles.linkBtn}>
        ← ホームへ
      </button>

      <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["/api/me", "/api/orders", "/api/admin/stats"].map((path) => (
          <button
            key={path}
            onClick={() => callApi(path)}
            disabled={loading === path}
            style={styles.btn}
          >
            {loading === path ? "..." : `GET ${path}`}
          </button>
        ))}
      </div>

      {Object.keys(results).length > 0 && (
        <div style={{ marginTop: 24 }}>
          {Object.entries(results).map(([path, result]) => (
            <div key={path} style={styles.result}>
              <div style={styles.resultHeader}>
                <code>{path}</code>
                <span
                  style={{
                    color: result.status >= 200 && result.status < 300 ? "green" : "red",
                    marginLeft: 8,
                    fontWeight: "bold",
                  }}
                >
                  {result.status}
                </span>
              </div>
              <pre style={styles.pre}>
                {result.error
                  ? result.error
                  : JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "sans-serif",
    maxWidth: 800,
    margin: "40px auto",
    padding: "0 16px",
  },
  btn: {
    padding: "8px 16px",
    fontSize: 14,
    cursor: "pointer",
    background: "#0066cc",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#0066cc",
    cursor: "pointer",
    fontSize: 14,
    padding: 0,
    textDecoration: "underline",
  },
  result: {
    marginBottom: 16,
    border: "1px solid #ddd",
    borderRadius: 6,
    overflow: "hidden",
  },
  resultHeader: {
    padding: "8px 12px",
    background: "#f5f5f5",
    borderBottom: "1px solid #ddd",
    fontSize: 14,
  },
  pre: {
    margin: 0,
    padding: 12,
    fontSize: 13,
    overflowX: "auto",
    background: "#fff",
  },
};
