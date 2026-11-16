# Quản lý Marchix · Bản thử mobile

Bản Expo + React Native + TypeScript dùng các collection `members` và `tasks` theo gói bàn giao ngày 09/11/2026. Nhân viên có thể cập nhật tiến độ, đánh dấu checklist và báo hoàn thành. Người giao có thể duyệt kết quả hoặc yêu cầu làm lại kèm nhận xét.

## Cấu trúc mã nguồn

| Vị trí | Trách nhiệm |
| --- | --- |
| `index.ts`, `App.tsx` | Điểm khởi động Expo, provider và chọn giao diện theo phiên đăng nhập. |
| `src/screens/` | Các màn hình Đăng nhập, Công việc, Chi tiết công việc, Phê duyệt, Chi tiết lượt duyệt, Dự án, Chấm công và Cài đặt. |
| `src/navigation/` | `workspaceRoutes.ts` khai báo màn hình và các mục menu. `WorkspaceNavigator.tsx` chọn màn hình trong workspace và giữ bộ lọc công việc khi chuyển màn hình. |
| `src/workspace/` | Khung workspace, thanh đầu trang và kết nối menu, thông báo với điều hướng. |
| `src/features/` | Thành phần và logic theo nghiệp vụ như công việc, thông báo và xác thực. Popup giao việc nằm trong `features/tasks/`. |
| `src/components/`, `src/theme/`, `src/utils/` | Giao diện dùng chung, màu và style, tiện ích tìm kiếm và ngày giờ. |
| `src/services/firebase/` | Khởi tạo Firebase và thiết lập lưu phiên đăng nhập theo nền tảng. |
| `functions/`, `scripts/`, `tests/` | Backend, dữ liệu mẫu và kiểm thử. |

Khi thêm màn hình workspace, đặt component trong `src/screens/` và nối màn hình trong `WorkspaceNavigator.tsx`. Nếu màn hình có mục trên menu, khai báo mục đó trong `workspaceRoutes.ts`. Để mở Quản lý Marchix bản web, dùng nút cạnh chuông thông báo.

## Chạy trên Windows

Cần Node.js 24 và JDK 21+ trên PATH. Mở PowerShell tại thư mục dự án. Dùng `npm.cmd` nếu PowerShell chặn tệp `npm.ps1`.

```powershell
npm.cmd ci
npm.cmd ci --prefix functions
npm.cmd ci --prefix tools/firebase-cli
npm.cmd run emulator
```

Firebase CLI dùng thư mục `tools/firebase-cli/node_modules` riêng. Có thể chạy lại `npm.cmd ci` ở thư mục gốc khi emulator đang chạy. Nếu cần chạy lại `npm.cmd ci --prefix tools/firebase-cli`, hãy dừng emulator trước bằng Ctrl+C.

Đợi Firebase báo các emulator đã sẵn sàng. Mở PowerShell thứ hai tại cùng thư mục.

```powershell
npm.cmd run seed
npm.cmd run web -- --localhost --port 8081
```

1. Mở [bản thử](http://localhost:8081) và bấm **Đăng nhập Google (mô phỏng)**. App mở **Tổng quan**.
2. Vào **Menu → Công việc**, mở **Kiểm tra giao diện trên điện thoại**, đổi trạng thái hoặc phần trăm, rồi bấm **Lưu tiến độ**.
3. Mở lại công việc hoặc xem document `tasks/kiem-tra-giao-dien` trong [Emulator Suite](http://127.0.0.1:4000). Lệnh seed đưa các bản ghi demo về trạng thái ban đầu.
4. Mở **Đối chiếu checklist phát hành**, đánh dấu mục còn lại và kiểm tra tiến độ lên 100%. Chọn **Báo hoàn thành**, sau đó lọc **Chờ duyệt** trong danh sách để mở lại việc.
5. Đăng xuất, chọn **Đăng nhập người giao việc (mô phỏng)** và mở **Phê duyệt** trong sidebar. Chọn đánh giá rồi bấm **Duyệt** để chuyển việc sang **Xong**, hoặc nhập lý do và bấm **Trả lại** để chuyển về **Đang làm**. Đăng nhập lại bằng tài khoản nhân viên để xem nhận xét.
6. Chọn **+ Giao việc**, nhập tên, chọn một hoặc nhiều thành viên, rồi chọn ngày bắt đầu và hạn chót trên lịch. Chạm lại tên để bỏ chọn. Dùng **+ Chọn tệp** để gửi tối đa 5 tệp, 5 MB mỗi tệp và 8 MB tính theo số bản gửi. Mỗi người nhận một việc riêng và tải được tệp trong **Trao đổi**. Mở **Tùy chọn thêm** để đặt dự án, checklist, lịch lặp, người theo dõi và lời nhắn.
7. Bấm chuông **Thông báo** để xem thông báo của tài khoản và xóa số đang hiện trên chuông. Bấm một thông báo công việc để đánh dấu đã đọc và mở chi tiết công việc, hoặc chọn **Đánh dấu tất cả đã đọc** ngay trong popup.
8. Mở **Dự án** từ menu, chọn **Marchix Mobile · Demo** rồi xem Tổng quan, Công việc đính kèm và Tài chính. Chọn một việc trong dự án để chuyển sang **Công việc** và mở popup chi tiết.
9. Mở **Chấm công** từ menu để ghi giờ vào, giờ ra và xem bảng công theo tháng. Với tài khoản quản trị, chọn nhân viên và ngày cần điều chỉnh. Khi `settings/work.gpsOn` bật, thiết bị cần cấp quyền vị trí khi dùng ứng dụng. Hãy build lại development client hoặc APK để nhận module định vị.

Firebase Auth Emulator cấp phiên từ ID token Google mô phỏng. Functions Emulator kiểm tra quyền, tính tiến độ theo tỷ lệ việc con đã xong và ghi trạng thái Chờ duyệt vào Firestore Emulator. Việc có checklist cần hoàn tất mọi mục trước khi gửi. Nếu `settings/work.requireReportNote` bật, nhân viên cần nhập kết quả thực hiện.

## Dùng APK với điện thoại Android

Bản **Quản lý Marchix Pilot 0.5.3** dùng Firebase Quản lý Marchix qua Internet. Cài APK trong `artifacts/`, rồi đăng nhập bằng tài khoản Google đã được cấp quyền trên bản web. Có thể cài đè lên Pilot 0.5.1 hoặc 0.5.2 nếu dùng cùng chứng thư ký.

Bản Pilot này bật giao việc, cập nhật tiến độ và checklist, trao đổi, tệp đính kèm, báo hoàn thành, trả lại và duyệt theo quyền Firestore hiện hành. Với việc cần duyệt, người giao chọn người duyệt có quyền trước khi nhân viên báo hoàn thành. Pilot ghi trực tiếp theo cùng quy tắc với bản web.

Bản mobile cập nhật dùng Cloud Function `scheduleRecurringTasks` để tạo kỳ mới lúc 00:05 giờ Việt Nam, tính từ ngày giao việc gốc. Hằng tuần lặp mỗi 7 ngày. Hằng tháng lặp cùng ngày hoặc ngày cuối tháng nếu tháng đó ngắn hơn. Trước khi phát hành Pilot, triển khai function vào dự án Firebase của Pilot và xác nhận Firestore Rules của Pilot cho phép lưu trường `repeatSchedule` khi giao việc lặp.

### Dùng bản Demo với Firebase Emulator

Kết nối điện thoại và máy chạy Firebase Emulator vào cùng mạng Wi-Fi tin cậy. Cài thư viện như phần trên rồi chạy `npm.cmd run emulator:lan`. Ở PowerShell thứ hai chạy `npm.cmd run seed` nếu cần tạo lại dữ liệu giả. Điện thoại truy cập cổng 9099 cho Auth, 8080 cho Firestore và 5001 cho Functions. Giao diện quản trị emulator mở trên máy tính. Tắt emulator sau buổi thử.

Cài APK, mở **Quản lý Marchix Demo** và chọn tài khoản mô phỏng muốn thử. Bản APK 0.4.0 trỏ tới IP Wi-Fi `192.168.1.107` của máy chạy emulator tại thời điểm build. Nếu IP đổi, cần build APK lại với địa chỉ mới.

Để build lại trên Windows, giải nén vào đường dẫn ngắn như `C:\src\marchix-mobile`. Dùng Android SDK Platform 37.0, Build-Tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 và JDK tương thích với Gradle. Đặt ba biến môi trường rồi chạy Expo prebuild và Gradle. APK có sẵn mã JavaScript để mở trực tiếp trên điện thoại. Khóa ký mặc định của mẫu Expo chỉ dùng để cài thử.

```powershell
$env:MARCHIX_LAN_APK='1'
$env:EXPO_PUBLIC_FIREBASE_MODE='emulator'
$env:EXPO_PUBLIC_EMULATOR_HOST='192.168.1.107'
npx.cmd expo prebuild --platform android --clean --no-install
Set-Location android
.\gradlew.bat :app:assembleRelease "-Pandroid.enableMinifyInReleaseBuilds=false"
```

APK nằm tại `android/app/build/outputs/apk/release/app-release.apk`.

## Kiểm thử

GitHub Actions chạy **Mobile CI** khi mở hoặc cập nhật pull request vào `main`, khi push lên `main`, hoặc khi chạy thủ công từ tab **Actions**. Pipeline kiểm tra TypeScript, chạy Firestore Rules, Cloud Functions và Playwright trên Firebase Emulator với dữ liệu giả, rồi build bản web Expo. Khi test lỗi, tải báo cáo và trace từ artifact `mobile-ci-diagnostics`. Khi push lên `main` và tất cả kiểm tra đạt, tải bản web từ `marchix-mobile-web-preview`. Pipeline không phát hành APK/iOS hay deploy production.

Dừng các tiến trình demo trên trước khi chạy kiểm thử tự động vì bộ kiểm thử khởi động emulator và Expo trên cùng cổng.

```powershell
npm.cmd run typecheck
npx.cmd playwright install chromium
npm.cmd run test:local
```

Có thể dùng Edge đã cài bằng cách đặt `$env:PLAYWRIGHT_CHANNEL='msedge'` và bỏ qua bước cài Chromium. Bộ kiểm thử xác nhận phân quyền bằng nhiều tài khoản và thao tác giao diện ở kích thước điện thoại bằng hai phiên trình duyệt.

Các bài kiểm thử luồng nghiệp vụ dùng fixture `tests/helpers/startupReminder.ts` để bấm **Đã xem** khi popup nhắc việc xuất hiện sau đăng nhập. Với trang phụ tạo bằng `browser.newPage()` hoặc `context.newPage()`, gọi `acknowledgeStartupReminder(page)` trước khi điều hướng. Bài `startup-reminder-preview.spec.ts` dùng Playwright gốc để tự kiểm tra nội dung, đóng popup và hiển thị lại sau đăng nhập, không tự động bỏ qua popup.

## Thử trên thiết bị native

- Dùng Expo development build. Trên Android Studio, chạy `npx expo run:android` với Android Emulator. App kết nối máy Windows qua `10.0.2.2`. Trên macOS, chạy `npx expo run:ios` với iOS Simulator.
- Thử trên điện thoại thật với backend emulator cần máy chạy Metro và Firebase cùng mạng tin cậy, `EXPO_PUBLIC_EMULATOR_HOST` trỏ về IP LAN của máy phát triển, các emulator lắng nghe trên giao diện LAN và máy cho phép kết nối các cổng cần thiết. Emulator dùng dữ liệu giả và nên chỉ mở trong thời gian thử.

## Khi có Firebase staging của công ty

### Thông báo đẩy trên Android và iOS

App native đăng ký thiết bị sau khi thành viên đăng nhập và cấp quyền thông báo.
Mỗi tài liệu mới trong `notifications` sẽ kích hoạt gửi push cho các thiết bị
đã đăng ký của người nhận. Màn hình khóa chỉ hiện lời nhắc chung. Khi chạm vào
push, app đọc thông báo theo quyền của tài khoản hiện tại rồi mở mục tương ứng.

1. Chọn EAS project cho bản staging hoặc pilot và đặt `MARCHIX_EAS_PROJECT_ID`
   trong môi trường build. Với Android, đặt `MARCHIX_GOOGLE_SERVICES_FILE` trỏ
   tới `google-services.json` của đúng package và cấu hình FCM v1 cho EAS.
   Với iOS, cấu hình APNs và provisioning profile cho đúng bundle ID.
   Xem [hướng dẫn cấu hình Expo Push](https://docs.expo.dev/push-notifications/push-notifications-setup/).
2. Đặt `MARCHIX_WORKSPACE_PUSH_ENABLED=true` trong cấu hình môi trường của Cloud
   Functions. Triển khai có chọn lọc hai hàm vào đúng dự án Firebase đã xác nhận,
   ví dụ `firebase deploy --only functions:setWorkspacePushDevice,functions:sendWorkspacePush --project <project-id>`.
   Hai collection `workspacePushDevices` và `workspacePushDispatches` do backend
   quản lý. Có thể bật Firestore TTL trên trường `expiresAt` của hai collection
   để dọn bản ghi hết hạn.
3. Tạo lại và cài native build. Nếu đã có thư mục `android/` hoặc `ios/` từ bản
   cũ, chạy lại Expo prebuild để áp dụng plugin. Trên thiết bị thật, đăng nhập
   bằng tài khoản staging, cấp quyền, đưa app xuống nền rồi giao một việc cho
   tài khoản đó. Kiểm tra push, thao tác mở đúng việc từ push và kiểm tra lại
   sau khi đăng xuất. Bản web và Firebase Emulator dùng chuông trong app.

Push dùng Expo Push Service. Backend ghi log kết quả lỗi trả về ngay khi gửi,
và hộp thông báo trong app vẫn chứa bản ghi gốc khi hệ điều hành không hiển thị push.

### Cấu hình Firebase và kiểm thử staging

1. Tạo dự án Firebase riêng. Bật Google trong Authentication, tạo Firestore và đăng ký một Firebase Web app để lấy cấu hình SDK. Nếu thử giao diện web, thêm hostname tương ứng vào Authorized Domains.
2. Sao chép `.env.example` thành `.env`, đặt chế độ `staging` và điền cấu hình của đúng dự án. SDK dùng auth domain mặc định `<project-id>.firebaseapp.com`. App chặn project ID production trong gói bàn giao.
3. Đăng ký Android và iOS với package/bundle ID `vn.marchix.quanly.staging`. Cấu hình OAuth client Android theo package và SHA-1 của certificate ký bản thử. Điền **Web OAuth client ID** vào `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` và **iOS OAuth client ID** vào `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Build lại development client để nhận cấu hình iOS URL scheme. [Hướng dẫn Expo Google Authentication](https://docs.expo.dev/guides/google-authentication/)
4. Trên một dự án **staging dành riêng cho bản thử**, triển khai `firestore.rules` sau khi kiểm tra project ID. Qua Firebase Console, tạo `members/{email}` cho người thử với các trường `name`, `email`, `role`, và thêm công việc giả có `title`, `assigneeEmail`, `status`, `progress`. Mã seed chỉ ghi vào emulator cục bộ.
5. Chạy development build có cấu hình staging rồi xác nhận Google Sign-In trên Android và iOS. Kiểm tra bản ghi thay đổi trên Console. Rules đi kèm dành cho bản thử mobile; nếu cùng dự án còn có bản web quản trị, cần thiết kế quyền cho cả hai client trước khi triển khai.

## Phạm vi cập nhật

Giao việc trên staging mặc định tắt. Để bật trên dự án staging đã xác định, đặt
`MARCHIX_TASK_ASSIGNMENT_ENABLED=true` cho Functions, triển khai các callable
`listMobileTaskAssignees`, `createMobileTask` và `downloadMobileTaskAttachment`, rồi đặt
`EXPO_PUBLIC_ENABLE_TASK_ASSIGNMENT=true` khi build app cho cùng dự án.
Các callable yêu cầu email đã xác minh và thành viên đang hoạt động. Form hiển thị tên và ảnh hồ sơ, hoặc chữ cái đầu nếu thiếu ảnh. Firebase Auth cần quyền đọc hồ sơ để dùng ảnh tài khoản Google khi hồ sơ thành viên thiếu ảnh. Công việc và tệp của tất cả người nhận được lưu trong cùng một giao dịch. Callable tải tệp kiểm tra người thực hiện và liên kết tệp với công việc.
Trong Pilot, chỉ cần đặt `EXPO_PUBLIC_ENABLE_TASK_ASSIGNMENT=true` cùng cấu hình Firebase và Google OAuth của Pilot khi build. Bản này dùng các quyền Firestore của Quản lý Marchix.

- Trạng thái chỉnh được gồm **Chưa làm**, **Đang làm**, **Vướng**. Tiến độ nhập từ 0 đến 100. Mốc 100% vẫn là tiến độ, còn báo hoàn thành và duyệt là thao tác nghiệp vụ riêng.
- Bản Emulator và Pilot cho phép đánh dấu việc con và tự tính tiến độ. Sau khi gửi duyệt, trạng thái, tiến độ và checklist được khóa; phần trao đổi vẫn dùng được. Công việc cũ chỉ ghi tên người làm cần được bổ sung `assigneeEmail` trước khi đưa lên mobile.
- Cập nhật checklist và gửi duyệt dùng giao dịch Firestore. Khi gửi, app ghi `status`, `progress`, `doneAt`, `updatedAt` và `updatedBy`. Kết quả thực hiện, nếu có, được thêm vào `comments` theo định dạng của web.
- **Phê duyệt** hiển thị công việc ở trạng thái **Chờ duyệt** theo hai nhóm. **Chờ tôi duyệt** dành cho người được chỉ định có quyền duyệt. **Chờ chỉ định người duyệt** hiển thị việc của người giao, hoặc mọi việc với quản trị viên trên Pilot, khi chưa có người duyệt hợp lệ. Bản Pilot lấy danh sách quyền duyệt từ cùng dữ liệu thành viên với web. Thao tác duyệt và trả lại trên staging cần bật cờ giao việc và triển khai callable `reviewTaskCompletion`.
- Popup thông báo dùng chung collection `notifications` của Quản lý Marchix, hiển thị 30 thông báo mới nhất và lưu riêng những thông báo đã xem qua chuông theo tài khoản trên thiết bị. Mobile đồng bộ trường `read` với bản web khi người dùng mở từng thông báo hoặc đánh dấu tất cả đã đọc. Thông báo công việc ưu tiên `taskId`; các bản ghi cũ chỉ có tên được mở khi xác định được một công việc tương ứng trong danh sách của tài khoản.
- Bản vá [quanly-web-task-notification-id.patch](patches/quanly-web-task-notification-id.patch) bổ sung `taskId` ngay khi mã web tạo thông báo công việc. Áp dụng từ thư mục gốc chứa `web/app.js`, đối chiếu với bản web `20261110-3` trước khi triển khai.

**Thu chi** dùng chung collection `cash` và định dạng tệp `files/{id}/chunks/{index}` với web. Thành viên xem khoản mình lập hoặc được giao duyệt; người có quyền `cashRecord` và quản trị viên xem toàn sổ. Người lập có thể thêm chứng từ khi tạo khoản hoặc sửa khoản còn chờ duyệt. App xem ảnh, PDF và cho phép lưu tệp. Trình xem PDF trên Android và iOS cần build lại app khi cập nhật từ phiên bản cũ. Quản trị viên chỉ định người duyệt và xuất CSV theo tháng, dự án. Người được giao và có quyền `cashReview` xử lý; người xác nhận giao dịch phải khác người duyệt và nhập mã tham chiếu.

Chạy `npm run test:rules` sau khi seed emulator để kiểm tra phân quyền và `npx playwright test tests/cash-preview.spec.ts` để thử luồng trên trình duyệt ở kích thước điện thoại. Bản pilot dùng Security Rules hiện có của Quản lý Marchix; rà soát riêng trước khi phát hành.
