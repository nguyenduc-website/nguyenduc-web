

## Thanh toán thủ công

Website hỗ trợ hai phương thức thủ công:
- **QR:** khách nhập số tiền, quét QR cố định và bấm `Tôi Đã Chuyển Khoản`. Admin kiểm tra giao dịch thực tế rồi xác nhận.
- **Thẻ cào:** khách nhập `Mã Thẻ` + `Số Seri`. Admin kiểm tra; khi duyệt phải nhập số tiền thực tế để cộng vào ví.
- Duyệt tạo giao dịch `DEPOSIT` và gửi notification cho khách.
- Từ chối gửi notification: QR báo Admin chưa nhận được tiền/giao dịch chưa hoàn tất; thẻ báo thẻ đã qua sử dụng hoặc không tồn tại.
- Mã thẻ và seri được mã hóa khi lưu database.
- Khu vực Admin: `/admin.html`.
- QR: `https://sf-static.upanhlaylink.com/img/image_20260929c368dc173817bc917d1ade9cd7a66dc8.jpg`
