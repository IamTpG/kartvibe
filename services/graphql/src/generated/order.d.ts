// KHÔNG SỬA TAY. Sinh từ order/openapi.json bằng `npm run contracts` (services/).
// Kiểu của hợp đồng mà order công bố; bên tiêu thụ không import mã của order.

export interface paths {
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Đơn của một người dùng, sắp theo id tăng dần
         * @description Mỗi lời gọi dùng đúng 2 truy vấn DB (lấy đơn, rồi lấy mọi item của các đơn đó).
         */
        get: {
            parameters: {
                query: {
                    userId: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Danh sách đơn (rỗng nếu không có) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OrderList"];
                    };
                };
                /** @description VALIDATION_ERROR: userId sai kiểu */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description INTERNAL_ERROR */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Còn sống */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Health"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/_metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Bộ đếm */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Metrics"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/_metrics/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Đã đặt lại bộ đếm */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Lỗi chung của mọi service; không lộ stack trace. */
        Error: {
            code: string;
            message: string;
        };
        Health: {
            /** @enum {string} */
            status: "ok";
        };
        /** @description Bộ đếm phục vụ đo; không tính /health và /_metrics. */
        Metrics: {
            service: string;
            requests: number;
            dbQueries: number;
        };
        OrderItem: {
            productId: number;
            quantity: number;
        };
        /** @description items theo thứ tự item_index. */
        Order: {
            id: number;
            userId: number;
            /** @enum {string} */
            status: "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
            /** Format: date-time */
            createdAt: string;
            items: components["schemas"]["OrderItem"][];
        };
        OrderList: {
            data: components["schemas"]["Order"][];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
