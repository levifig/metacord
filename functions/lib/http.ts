export function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function errorResponse(
  message: string,
  status = 400,
  headers: HeadersInit = {}
): Response {
  return jsonResponse({ error: message }, status, headers);
}
