import { errorHandling, telemetryData } from "./utils/middleware";

function UnauthorizedException(reason) {
    return new Response(reason, {
        status: 401,
        statusText: "Unauthorized",
        headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            // Disables caching by default.
            "Cache-Control": "no-store",
            // Returns the "Content-Length" header for HTTP HEAD requests.
            "Content-Length": reason.length,
        },
    });
}

function isValidAuthCode(envAuthCode, authCode) {
    return authCode === envAuthCode;
}

function isAuthCodeDefined(authCode) {
    return authCode !== undefined && authCode !== null && authCode.trim() !== '';
}


function getCookieValue(cookies, name) {
    const match = cookies.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

const imageMimeTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'avif': 'image/avif'
  };
  
function getExt(filename) {
    return filename.split('.').pop() || 'jpg';
  }

function getMimeType(ext) {
    return imageMimeTypes[ext] || 'image/jpeg';
}

function genFileKey(ext) {
    // 生成日期字符串
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let randomFileName = '';
    const charactersLength = characters.length;
    for (let i = 0; i < 16; i++) {
        randomFileName += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return `${year}${month}${day}/${randomFileName}.${ext}`;
}

export async function onRequestPost(context) {  // Contents of context object
    const { request, env, params, waitUntil, next, data } = context;
    const url = new URL(request.url);
    // 优先从请求 URL 获取 authCode
    let authCode = url.searchParams.get('authCode');
    // 如果 URL 中没有 authCode，从 Referer 中获取
    if (!authCode) {
        const referer = request.headers.get('Referer');
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                authCode = new URLSearchParams(refererUrl.search).get('authCode');
            } catch (e) {
                console.error('Invalid referer URL:', e);
            }
        }
    }
    // 如果 Referer 中没有 authCode，从请求头中获取
    if (!authCode) {
        authCode = request.headers.get('authCode');
    }
    // 如果请求头中没有 authCode，从 Cookie 中获取
    if (!authCode) {
        const cookies = request.headers.get('Cookie');
        if (cookies) {
            authCode = getCookieValue(cookies, 'authCode');
        }
    }
    if (isAuthCodeDefined(env.AUTH_CODE) && !isValidAuthCode(env.AUTH_CODE, authCode)) {
        return new UnauthorizedException("error");
    }
    const clonedRequest = request.clone();
    // 构建目标 URL 时剔除 authCode 参数
    const targetUrl = new URL(url.pathname, 'https://telegra.ph');
    url.searchParams.forEach((value, key) => {
        if (key !== 'authCode') {
            targetUrl.searchParams.append(key, value);
        }
    });
    // 复制请求头并剔除 authCode
    const headers = new Headers(clonedRequest.headers);
    headers.delete('authCode');

    const formData = await request.formData();
    const file = formData.get('file'); // 'file' 是表单中的文件字段名称
    if (!file) {
      return new Response('No file uploaded', { status: 400 });
    }
    const ext = getExt(file.name);
    const mimeType = getMimeType(ext);

    const fileBuffer = await file.arrayBuffer();
    const fileContent = new Uint8Array(fileBuffer);

    const key  = genFileKey(ext);
    const res = await env.R2.put(key, fileContent, {
        'Content-Type': mimeType,
    });
    const time = new Date().getTime();

    console.log('id', res.key)
    await env.img_url.put(res.key, "", {
        metadata: { ListType: "None", Label: "None", TimeStamp: time },
    });
    const result = [{
        src: `/file/${res.key}`
    }]
    return new Response(JSON.stringify(result), { status: 200 });
}
