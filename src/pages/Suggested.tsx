import { ArrowLeft, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PeopleYouMayKnow } from "@/components/candy/people-you-may-know";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";

function SuggestedInner() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const province = me?.province || me?.location || null;

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <header className="app-header">
          <div className="inline-flex items-center gap-3 min-w-0">
            <button className="icon-button" onClick={() => navigate(-1)} aria-label="Quay lại">
              <ArrowLeft size={18} />
            </button>
            <div className="stack-xxs min-w-0">
              <div className="inline-flex items-center gap-2">
                <Users size={16} />
                <h1 className="page-title truncate">Có thể bạn quen biết</h1>
              </div>
              <p className="header-subtitle">
                Gợi ý kết bạn {province ? `tại ${province}` : "trên toàn quốc"}.
              </p>
            </div>
          </div>
        </header>
        <div className="page-body">
          <PeopleYouMayKnow
            province={province}
            onOpenProfile={(id) => navigate(`/profile/${id}`)}
          />
        </div>
      </div>
    </main>
  );
}

const Suggested = () => (
  <AuthProvider>
    <SuggestedInner />
  </AuthProvider>
);

export default Suggested;
