import { IsString, Length } from 'class-validator';

export class MfaTokenDto {
  @IsString()
  @Length(6, 6, { message: 'Kod powinien mieć 6 cyfr.' })
  token!: string;
}
