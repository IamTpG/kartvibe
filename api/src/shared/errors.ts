export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'CART_NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'CART_CLOSED'
  | 'ITEM_ALREADY_IN_CART'
  | 'INSUFFICIENT_STOCK'
  | 'PRODUCT_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'ROUTE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED';

export interface ErrorDetail {
  field: string;
  issue: string;
}

const DEFAULTS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: 'Request không hợp lệ' },
  CART_NOT_FOUND: { status: 404, message: 'Không tìm thấy giỏ hàng' },
  ITEM_NOT_FOUND: { status: 404, message: 'Sản phẩm không có trong giỏ hàng' },
  CART_CLOSED: { status: 409, message: 'Giỏ hàng đã checkout, không thể chỉnh sửa' },
  ITEM_ALREADY_IN_CART: {
    status: 409,
    message: 'Sản phẩm đã có trong giỏ, dùng PATCH để đổi số lượng',
  },
  INSUFFICIENT_STOCK: { status: 409, message: 'Không đủ hàng trong kho' },
  PRODUCT_UNAVAILABLE: { status: 422, message: 'Sản phẩm không tồn tại hoặc đã ngừng bán' },
  INTERNAL_ERROR: { status: 500, message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' },
  ROUTE_NOT_FOUND: { status: 404, message: 'Không tìm thấy endpoint' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method không được hỗ trợ' },
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly details: ErrorDetail[] = [],
  ) {
    super(DEFAULTS[code].message);
    this.status = DEFAULTS[code].status;
  }
}

export const errorMessage = (code: ErrorCode) => DEFAULTS[code].message;
