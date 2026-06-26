import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(12, { message: 'Hasło musi mieć co najmniej 12 znaków.' })
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Hasło musi zawierać co najmniej jedną literę i jedną cyfrę.',
  })
  newPassword!: string;

  @IsString()
  confirmPassword!: string;
}
