import type { NextConfig } from "next";

/**
 * 한 도메인 아래에 고객사를 여러 개 올릴 때 쓰는 앞자리.
 * 예) BASE_PATH=/leehk  →  https://helpcenter.example.com/leehk
 *
 * 빌드 시점에 정해지는 값이라 컨테이너를 띄울 때 바꿀 수 없다.
 * docker-compose 의 build.args 로 넘겨야 하고, 값을 바꾸면 이미지를 다시 빌드해야 한다.
 * 뿌리(/)로 서비스할 때는 비워 둔다.
 */
const rawBasePath = (process.env.BASE_PATH || "").trim().replace(/\/+$/, "");
if (rawBasePath && !rawBasePath.startsWith("/")) {
  throw new Error(`BASE_PATH 는 "/" 로 시작해야 합니다: ${rawBasePath}`);
}

const nextConfig: NextConfig = {
  basePath: rawBasePath || undefined,
};

export default nextConfig;
