import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // While Firebase resolves the auth state, show nothing (avoids flash)
  if (loading) return null;

  if (!user) {
    // Redirect to login, preserving intended destination for post-login redirect
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
