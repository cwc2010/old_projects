import sys
sys.set_int_max_str_digits(1000000000)
for a in range(1,1000000000,8):
	open("2^"+str(a)+".txt","a").write(str(2**a))
