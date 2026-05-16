import sys
sys.set_int_max_str_digits(1000000000)
for a in [12,123,1234,12345,123456,1234567,12345678,123456789]:
	open(str(a)+"_exp_"+str(a)+".text","a").write(str(a**a))
