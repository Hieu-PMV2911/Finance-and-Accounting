import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * Băm và kiểm tra mật khẩu. Tập trung một chỗ để dễ thay đổi thuật toán.
 */
@Injectable()
export class PasswordService {
  private readonly saltRounds = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
