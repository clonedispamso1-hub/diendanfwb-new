/**
 * USER → Xu → Đại lý.
 *
 * Danh sách đại lý dạng card premium. "Xem thông tin" → popup Avatar / Tên /
 * UID / Mức giao dịch + "Nhắn tin" (mở đúng cuộc trò chuyện). Kèm nút
 * "Hướng dẫn rút tiền" hiển thị nội dung Admin nhập.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { avatarSrc } from "@/lib/image-cdn";
import { useAgentsConfig, type AgentEntry } from "@/lib/agents";

export function AgentsPanel() {
  const navigate = useNavigate();
  const { cfg, loading } = useAgentsConfig();
  const [detail, setDetail] = useState<AgentEntry | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const openChat = (id: string) => {
    setDetail(null);
    navigate(`/chat/${id}`);
  };

  return (
    <div className="ag-wrap">
      <div className="ag-head">
        <div>
          <div className="ag-title">Đại lý</div>
          <div className="ag-sub">Liên hệ đại lý để được hỗ trợ giao dịch</div>
        </div>
        <button type="button" className="ag-guide-btn" onClick={() => setGuideOpen(true)}>
          Hướng dẫn rút tiền
        </button>
      </div>

      {loading ? (
        <div className="ag-empty">Đang tải danh sách đại lý…</div>
      ) : cfg.agents.length === 0 ? (
        <div className="ag-empty">Chưa có đại lý nào.</div>
      ) : (
        <div className="ag-grid">
          {cfg.agents.map((a) => (
            <div key={a.id} className="ag-card">
              <div className="ag-card-glow" />
              <img
                className="ag-avatar"
                src={avatarSrc(a.avatar || "", 96)}
                alt={a.name || "Đại lý"}
                loading="lazy"
                decoding="async"
              />
              <div className="ag-card-name">{a.name || "Đại lý"}</div>
              <div className="ag-card-verified">🟢 Đã xác minh</div>
              <div className="ag-card-level">Cấp 1</div>
              <button type="button" className="ag-view" onClick={() => setDetail(a)}>
                Xem thông tin
              </button>
            </div>
          ))}
        </div>
      )}

      {detail ? (
        <div className="ag-backdrop" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className="ag-modal" onClick={(e) => e.stopPropagation()}>
            <img
              className="ag-modal-avatar"
              src={avatarSrc(detail.avatar || "", 160)}
              alt={detail.name || "Đại lý"}
            />
            <div className="ag-modal-name">{detail.name || "Đại lý"}</div>
            <div className="ag-modal-row">
              <span>Hỗ Trợ Nạp Rút</span>
              <b>{detail.level?.trim() || "Liên hệ đại lý"}</b>
            </div>
            <button type="button" className="ag-msg" onClick={() => openChat(detail.id)}>
              Nhắn tin
            </button>
            <button type="button" className="ag-close" onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}

      {guideOpen ? (
        <div className="ag-backdrop" role="dialog" aria-modal="true" onClick={() => setGuideOpen(false)}>
          <div className="ag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ag-modal-name">Hướng dẫn rút tiền</div>
            <div className="ag-guide-text">
              {cfg.guide.trim() ? cfg.guide : "Admin chưa cập nhật hướng dẫn rút tiền."}
            </div>
            <button type="button" className="ag-close" onClick={() => setGuideOpen(false)}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}

      <style>{`
        .ag-wrap { margin-top: 16px; }
        .ag-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap; margin-bottom: 14px; }
        .ag-title { font-size: 17px; font-weight: 800; color: #222; }
        .ag-sub { font-size: 12.5px; font-weight: 600; color: #6b6880; margin-top: 2px; }
        .ag-guide-btn { border: 1px solid #e6e4ee; background: #fff; color: #7c3aed;
          border-radius: 999px; padding: 10px 16px; font-size: 13.5px; font-weight: 800;
          cursor: pointer; box-shadow: 0 10px 24px -18px rgba(20,10,40,.6); }
        .ag-empty { padding: 26px 16px; text-align: center; font-size: 13.5px; font-weight: 600;
          color: #6b6880; background: #fff; border: 1px solid #ececf3; border-radius: 16px; }
        .ag-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
        @media (min-width: 560px) { .ag-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        .ag-card { position: relative; overflow: hidden; background: #fff; border: 1px solid #ececf3;
          border-radius: 18px; padding: 16px 12px 14px; text-align: center;
          box-shadow: 0 14px 30px -24px rgba(20,10,40,.7); transition: transform .18s, box-shadow .18s; }
        .ag-card:hover { transform: translateY(-3px); box-shadow: 0 20px 36px -24px rgba(124,58,237,.65); }
        .ag-card-glow { position: absolute; inset: -40% 40% 60% -40%; background:
          radial-gradient(circle at 30% 30%, rgba(139,92,246,.22), transparent 65%); pointer-events: none; }
        .ag-avatar { width: 62px; height: 62px; border-radius: 999px; object-fit: cover;
          border: 2px solid rgba(139,92,246,.35); background: #f1eff8; }
        .ag-card-name { margin-top: 9px; font-size: 14.5px; font-weight: 800; color: #222;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ag-card-verified { margin-top: 4px; font-size: 11.5px; font-weight: 800; color: #16a34a; }
        .ag-card-level { margin-top: 2px; font-size: 11px; font-weight: 600; color: #8a86a0; }
        .ag-view { margin-top: 11px; width: 100%; border: none; border-radius: 12px; padding: 10px;
          font-size: 13px; font-weight: 800; color: #fff; cursor: pointer;
          background: linear-gradient(135deg,#8b5cf6,#ec4899);
          box-shadow: 0 14px 26px -18px rgba(236,72,153,.95); }
        .ag-backdrop { position: fixed; inset: 0; z-index: 3000; background: rgba(16,10,32,.55);
          backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .ag-modal { width: 100%; max-width: 360px; background: #fff; border-radius: 22px; padding: 22px 18px;
          text-align: center; box-shadow: 0 30px 60px -30px rgba(20,10,40,.8); }
        .ag-modal-avatar { width: 86px; height: 86px; border-radius: 999px; object-fit: cover;
          border: 3px solid rgba(139,92,246,.35); }
        .ag-modal-name { margin-top: 10px; font-size: 17px; font-weight: 800; color: #222; }
        .ag-modal-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
          margin-top: 12px; padding: 11px 13px; border-radius: 14px; background: #f7f6fb;
          font-size: 13.5px; font-weight: 700; color: #6b6880; }
        .ag-modal-row b { color: #222; }
        .ag-msg { margin-top: 18px; width: 100%; border: none; border-radius: 14px; padding: 13px;
          font-size: 15px; font-weight: 800; color: #fff; cursor: pointer;
          background: linear-gradient(135deg,#8b5cf6,#ec4899);
          box-shadow: 0 16px 30px -18px rgba(236,72,153,.95); }
        .ag-close { margin-top: 9px; width: 100%; border: 1px solid #e6e4ee; background: #f8f7fc;
          border-radius: 14px; padding: 11px; font-size: 14px; font-weight: 800; color: #555; cursor: pointer; }
        .ag-guide-text { margin-top: 12px; text-align: left; white-space: pre-wrap; font-size: 14px;
          line-height: 1.65; font-weight: 600; color: #333; max-height: 55vh; overflow: auto; }
      `}</style>
    </div>
  );
}
