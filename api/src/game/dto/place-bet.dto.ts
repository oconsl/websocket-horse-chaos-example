import { IsInt, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class PlaceBetDto {
  @IsString()
  @IsNotEmpty()
  horseId!: string;

  @IsInt()
  @IsPositive()
  amount!: number;
}
