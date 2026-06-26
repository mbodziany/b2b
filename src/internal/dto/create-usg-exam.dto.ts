import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateUsgExamDto {
  @IsString()
  clinicId!: string;

  @IsString()
  @MinLength(1)
  patientReference!: string;

  @IsDateString()
  examDate!: string;

  @IsString()
  @MinLength(1)
  examType!: string;

  @IsString()
  @MinLength(1)
  performedBy!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
