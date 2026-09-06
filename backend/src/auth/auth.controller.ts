import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Step 1: username + password -> OTP emailed, returns a loginToken (not a session yet). */
  @Public()
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body?.username, body?.password);
  }

  /** Step 2: loginToken + emailed OTP -> real JWT. */
  @Public()
  @Post('verify-otp')
  async verifyOtp(@Body() body: { loginToken: string; otp: string }) {
    return this.authService.verifyOtp(body?.loginToken, body?.otp);
  }

  /** Re-sends the OTP for a pending (not yet verified) login session. */
  @Public()
  @Post('resend-otp')
  async resendOtp(@Body() body: { loginToken: string }) {
    return this.authService.resendOtp(body?.loginToken);
  }
}
