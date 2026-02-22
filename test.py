# a= [5,7,8,2,1,4,5,6,8,9]
# print (len(a))


# for i in range(0,len(a)-1):
#     for j in range (i+1 ,len(a)):
#         if a[i]>a[j]:
#             t=a[j]
#             a[j]=a[i]
#             a[i]=t
# print(a)

# seen=set()
# for x in [1, 2, 2, 3]:
#     if x in seen:
#         print(x, "e deja văzut")
#     else:
#         print(x, "nou, il adaug")
#         seen.add(x)

# print("seen =", seen)


# def reverse_string(s):
#     chars = list(s)
#     i, j = 0, len(chars) - 1
#     while i < j:
#         chars[i], chars[j] = chars[j], chars[i]
#         i += 1
#         j -= 1
#     return ''.join(chars)

# print(reverse_string('razvan'))


def merge(intervals):
    intervals.sort(key=lambda x: x[0])  # sort by start
    merged = [intervals[0]]

    for start, end in intervals[1:]:
        last = merged[-1]
        if start <= last[1]:          # overlap
            last[1] = max(last[1], end)
        else:
            merged.append([start, end])
    
    return merged

a=[[1,3],[2,6],[8,10],[15,18]]
a.sort()
print(a)

# print(merge(a))