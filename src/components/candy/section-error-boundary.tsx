/**
 * SectionErrorBoundary — chống "màn hình trắng" cho từng khối nội dung.
 *
 * Trước đây không có error boundary nào bao quanh feed / tab Cộng Đồng: một lỗi
 * render (hoặc lazy chunk lỗi) làm React unmount cả subtree → vùng nội dung
 * trắng hoàn toàn. Boundary này giữ lại phần còn lại của trang, hiển thị thông
 * báo + nút "Thử lại" (chỉ remount subtree, KHÔNG reload trang).
 *
 * `resetKey` đổi (ví dụ khi chuyển tab) → tự xoá trạng thái lỗi cũ để tab mới
 * không bị kẹt ở fallback.
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Đổi giá trị này sẽ reset trạng thái lỗi (dùng khi chuyển tab). */
  resetKey?: string | number;
  /** Nhãn khối để thông báo rõ ràng hơn. */
  label?: string;
}

interface State {
  error: Error | null;
  attempt: number;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Ghi log để debug, không làm gì thêm.
    console.error("[SectionErrorBoundary]", this.props.label ?? "", error, info?.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="feed-retry" role="alert">
          <p className="feed-retry__text">
            Không hiển thị được nội dung. Bấm "Thử lại" nhé.
          </p>
          <button type="button" className="feed-retry__btn" onClick={this.retry}>
            Thử lại
          </button>
        </div>
      );
    }
    // `key` theo attempt: bấm Thử lại sẽ remount subtree từ đầu.
    // Fragment (không thêm DOM) để layout/CSS hiện tại không đổi.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

export default SectionErrorBoundary;
